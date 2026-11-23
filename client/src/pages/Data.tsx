import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  activateBestPracticeImport,
  createBestPracticeRevision,
  deactivateBestPracticeImport,
  deleteBestPracticeImport,
  listBestPracticeImports,
  uploadBestPractices,
  type BestPracticeImportJob,
  type BestPracticeImportResult,
} from '../api/data';
import { Button } from '../components/Button';
import { Page, PageHeader } from '../components/Page';
import { Panel } from '../components/Panel';
import styles from './Data.module.css';

function formatStatus(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function Data() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [libraryName, setLibraryName] = useState('VariantRank Best Practices');
  const [imports, setImports] = useState<BestPracticeImportJob[]>([]);
  const [result, setResult] = useState<BestPracticeImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  async function refreshImports() {
    try {
      setImports(await listBestPracticeImports());
    } catch {
      // Upload remains available when import history cannot be loaded.
    }
  }

  useEffect(() => {
    void refreshImports();
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const closeFromOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(`.${styles.actionMenuList}`) && !target.closest(`.${styles.actionMenuTrigger}`)) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', closeFromOutsideClick);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', closeFromOutsideClick);
    };
  }, [openMenu]);

  function toggleMenu(itemId: string, button: HTMLButtonElement) {
    if (openMenu?.id === itemId) {
      setOpenMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = 150;
    setOpenMenu({
      id: itemId,
      top: rect.bottom + menuHeight < window.innerHeight
        ? rect.bottom + 6
        : Math.max(8, rect.top - menuHeight - 6),
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !libraryName.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const uploaded = await uploadBestPractices(file, libraryName.trim());
      setResult(uploaded);
      await refreshImports();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  async function deactivate(item: BestPracticeImportJob) {
    if (!window.confirm(`Deactivate ${item.library.name} v${item.publishedVersion?.version}? Future evaluations will use the default scoring model.`)) return;
    setError('');
    try {
      await deactivateBestPracticeImport(item.id);
      await refreshImports();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not deactivate library');
    }
  }

  async function activate(item: BestPracticeImportJob) {
    if (!window.confirm(`Activate ${item.library.name} v${item.publishedVersion?.version}? Any other active version of this library will be deactivated.`)) return;
    setError('');
    try {
      await activateBestPracticeImport(item.id);
      await refreshImports();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not activate library');
    }
  }

  async function revise(item: BestPracticeImportJob) {
    if (!window.confirm(`Create a reviewable revision from ${item.library.name} v${item.publishedVersion?.version}?`)) return;
    setError('');
    try {
      const revision = await createBestPracticeRevision(item.id);
      navigate(`/data/imports/${revision.id}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not create revision');
    }
  }

  async function remove(item: BestPracticeImportJob) {
    const versionLabel = item.publishedVersion ? ` and published version v${item.publishedVersion.version}` : '';
    if (!window.confirm(`Permanently delete “${item.fileName}”${versionLabel}? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteBestPracticeImport(item.id);
      await refreshImports();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not delete import');
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Knowledge"
        title="Data"
        description="Upload best-practice knowledge for extraction and review. Imports never affect scoring until a library version is approved and published."
      />

      <Panel title="Best-practice library">
        <form className={styles.uploadForm} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Library name</span>
            <input
              value={libraryName}
              onChange={(event) => setLibraryName(event.target.value)}
              placeholder="e.g. Ecommerce UX Best Practices"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Best-practice document</span>
            <input
              type="file"
              accept=".xlsx,.csv,.json,.txt,.md,.markdown,.pdf,.docx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <div className={styles.submitRow}>
            <p>XLSX, CSV, JSON, TXT, Markdown, PDF or DOCX · Maximum 50 MB · Staged for review</p>
            <Button type="submit" disabled={!file || loading}>
              {loading ? 'Extracting…' : 'Upload and extract'}
            </Button>
          </div>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </Panel>

      {result && (
        <Panel title="Extraction complete" tone="dark">
          <p className={styles.resultIntro}>
            <strong>{result.fileName}</strong> is staged as <strong>Needs review</strong>. No scoring rules were activated.
          </p>
          <dl className={styles.stats}>
            <div><dt>Source rows</dt><dd>{result.summary.rowsFound}</dd></div>
            <div><dt>Proposed checks</dt><dd>{result.summary.proposedCriteria}</dd></div>
            <div><dt>Duplicates merged</dt><dd>{result.summary.duplicateRowsMerged}</dd></div>
            <div><dt>Skipped</dt><dd>{result.summary.skippedRows}</dd></div>
          </dl>
          <p className={styles.sheets}>{result.summary.sheetsProcessed.join(' · ')}</p>
        </Panel>
      )}

      <Panel title="Import history">
        {imports.length === 0 ? (
          <p className={styles.empty}>No best-practice documents have been uploaded through the Data workflow.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Library</th><th>File</th><th>Status</th><th>Checks</th><th>Uploaded</th><th>Actions</th></tr></thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td><Link className={styles.reviewLink} to={`/data/imports/${item.id}`}>{item.library.name}</Link></td>
                    <td>{item.fileName}</td>
                    <td>
                      <Link to={`/data/imports/${item.id}`}>
                        <span className={`${styles.status} ${item.publishedVersion?.isActive ? styles.active : ''}`}>
                          {item.publishedVersion
                            ? `${item.publishedVersion.isActive ? 'Active' : 'Inactive'} · v${item.publishedVersion.version}`
                            : formatStatus(item.status)}
                        </span>
                      </Link>
                    </td>
                    <td>{item._count.candidates}</td>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.actionMenuTrigger}
                        aria-label={`Actions for ${item.library.name}`}
                        aria-expanded={openMenu?.id === item.id}
                        onClick={(event) => toggleMenu(item.id, event.currentTarget)}
                      >
                        ⋯
                      </button>
                      {openMenu?.id === item.id && createPortal(
                        <div
                          className={styles.actionMenuList}
                          style={{ top: openMenu.top, left: openMenu.left }}
                          onClick={() => setOpenMenu(null)}
                        >
                          {item.publishedVersion ? (
                            <>
                              <button type="button" onClick={() => void (item.publishedVersion?.isActive ? deactivate(item) : activate(item))}>
                                {item.publishedVersion.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button type="button" onClick={() => void revise(item)}>Create revision</button>
                              <button type="button" className={styles.dangerAction} onClick={() => void remove(item)}>Delete permanently</button>
                            </>
                          ) : (
                            <>
                              <Link to={`/data/imports/${item.id}`}>Review</Link>
                              <button type="button" className={styles.dangerAction} onClick={() => void remove(item)}>Delete</button>
                            </>
                          )}
                        </div>,
                        document.body,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
