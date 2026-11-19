import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  approveAllProposedCandidates,
  bulkUpdateBestPracticeCandidates,
  getBestPracticeImport,
  publishBestPracticeImport,
  updateBestPracticeCandidate,
  type CandidateStatus,
  type EvaluationMethod,
  type ImportReview as ImportReviewData,
  type ScoreCategory,
} from '../api/data';
import { Button } from '../components/Button';
import { Page, PageHeader } from '../components/Page';
import { Panel } from '../components/Panel';
import styles from './ImportReview.module.css';

const CATEGORIES: Array<{ value: ScoreCategory; label: string }> = [
  { value: 'SHOPPING_UX', label: 'Shopping UX' },
  { value: 'TRUST_CONFIDENCE', label: 'Trust & confidence' },
  { value: 'OFFER_CLARITY', label: 'Offer clarity' },
  { value: 'PURCHASE_EASE', label: 'Purchase ease' },
  { value: 'TECHNICAL_ACCESSIBILITY', label: 'Technical & accessibility' },
];

const METHODS: Array<{ value: EvaluationMethod; label: string }> = [
  { value: 'AUTOMATED', label: 'Automated' },
  { value: 'AI_ASSISTED', label: 'AI-assisted' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'MANUAL', label: 'Manual' },
];

function readable(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function ImportReview() {
  const { importId = '' } = useParams();
  const [review, setReview] = useState<ImportReviewData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState('');
  const [pageArea, setPageArea] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState<{ version: number; count: number } | null>(null);

  const load = useCallback(async () => {
    if (!importId) return;
    try {
      setError('');
      setReview(await getBestPracticeImport(importId, { search, status, outcome, pageArea, page, pageSize: 50 }));
      setSelected(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load import');
    }
  }, [importId, search, status, outcome, pageArea, page]);

  useEffect(() => { void load(); }, [load]);

  async function updateCandidate(candidateId: string, update: Parameters<typeof updateBestPracticeCandidate>[2]) {
    setBusy(true);
    try {
      await updateBestPracticeCandidate(importId, candidateId, update);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function bulkStatus(nextStatus: CandidateStatus) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await bulkUpdateBestPracticeCandidates(importId, [...selected], nextStatus);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  }

  async function approveAll() {
    if (!review || proposed === 0) return;
    if (!window.confirm(`Approve all ${proposed} proposed checks using their suggested category and evaluation method?`)) return;
    setBusy(true);
    try {
      await approveAllProposedCandidates(importId);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Approve all failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!window.confirm('Publish this reviewed library version? Published criteria become immutable.')) return;
    setBusy(true);
    try {
      const version = await publishBestPracticeImport(importId);
      setPublished({ version: version.version, count: version._count.criteria });
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  const proposed = review?.summary.statuses.PROPOSED ?? 0;
  const approved = review?.summary.statuses.APPROVED ?? 0;
  const editable = review?.import.status === 'NEEDS_REVIEW';

  return (
    <Page>
      <PageHeader
        eyebrow="Library review"
        title={review?.import.library.name ?? 'Import review'}
        description={<><Link to="/data">Back to Data</Link> · Review every extracted check before publishing.</>}
        actions={editable ? <Button onClick={publish} disabled={busy || proposed > 0 || approved === 0}>Publish library</Button> : undefined}
      />

      {error && <p className={styles.error} role="alert">{error}</p>}
      {published && <Panel tone="dark"><strong>Library version {published.version} published with {published.count} approved checks.</strong></Panel>}

      {review && (
        <>
          <dl className={styles.summary}>
            <div><dt>Total</dt><dd>{review.summary.total}</dd></div>
            <div><dt>Proposed</dt><dd>{proposed}</dd></div>
            <div><dt>Approved</dt><dd>{approved}</dd></div>
            <div><dt>Rejected</dt><dd>{review.summary.statuses.REJECTED ?? 0}</dd></div>
          </dl>

          <Panel title="Review checks">
            <div className={styles.filters}>
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search checks…" />
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                {(['PROPOSED', 'APPROVED', 'REJECTED', 'MERGED'] as CandidateStatus[]).map((value) => <option key={value} value={value}>{readable(value)}</option>)}
              </select>
              <select value={outcome} onChange={(event) => { setOutcome(event.target.value); setPage(1); }}>
                <option value="">All outcomes</option>
                {review.filters.outcomes.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
              </select>
              <select value={pageArea} onChange={(event) => { setPageArea(event.target.value); setPage(1); }}>
                <option value="">All page areas</option>
                {review.filters.pageAreas.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>

            {editable && (
              <div className={styles.bulkBar}>
                <label><input type="checkbox" checked={review.candidates.length > 0 && selected.size === review.candidates.length} onChange={(event) => setSelected(event.target.checked ? new Set(review.candidates.map((item) => item.id)) : new Set())} /> Select page</label>
                <span>{selected.size} selected</span>
                <Button size="small" onClick={() => bulkStatus('APPROVED')} disabled={busy || selected.size === 0}>Approve</Button>
                <Button size="small" variant="secondary" onClick={() => bulkStatus('REJECTED')} disabled={busy || selected.size === 0}>Reject</Button>
                <Button size="small" onClick={approveAll} disabled={busy || proposed === 0}>Approve all proposed</Button>
              </div>
            )}

            <div className={styles.checks}>
              {review.candidates.map((candidate) => {
                const proposedCheck = candidate.proposedCriterion;
                return (
                  <article className={styles.check} key={candidate.id}>
                    <div className={styles.checkSelect}>
                      <input type="checkbox" aria-label={`Select ${proposedCheck.title}`} checked={selected.has(candidate.id)} disabled={!editable} onChange={(event) => setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.id);
                        else next.delete(candidate.id);
                        return next;
                      })} />
                    </div>
                    <div className={styles.checkBody}>
                      <div className={styles.checkMeta}><span>{candidate.sourceSheet} · row {candidate.sourceRow}</span><span>{Math.round((candidate.extractionConfidence ?? 0) * 100)}% extraction confidence</span></div>
                      <h3>{proposedCheck.description || proposedCheck.title}</h3>
                      {proposedCheck.rationale && <details><summary>Why it matters</summary><p>{proposedCheck.rationale}</p></details>}
                      <div className={styles.tags}>
                        {proposedCheck.pageAreas?.map((value) => <span key={value}>{value}</span>)}
                        {proposedCheck.outcomeMappings?.map((value) => <span key={value}>{readable(value)}</span>)}
                      </div>
                    </div>
                    <div className={styles.decisions}>
                      <label>Status<select disabled={!editable || busy} value={candidate.status} onChange={(event) => void updateCandidate(candidate.id, { status: event.target.value as CandidateStatus })}>{(['PROPOSED', 'APPROVED', 'REJECTED'] as CandidateStatus[]).map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
                      <label>Category<select disabled={!editable || busy} value={proposedCheck.primaryCategory} onChange={(event) => void updateCandidate(candidate.id, { primaryCategory: event.target.value as ScoreCategory })}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                      <label>Evaluation<select disabled={!editable || busy} value={proposedCheck.evaluationMethod} onChange={(event) => void updateCandidate(candidate.id, { evaluationMethod: event.target.value as EvaluationMethod })}>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={styles.pagination}>
              <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <span>Page {review.pagination.page} of {review.pagination.pages} · {review.pagination.total} checks</span>
              <Button variant="secondary" size="small" disabled={page >= review.pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </Panel>
        </>
      )}
    </Page>
  );
}
