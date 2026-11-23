import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation, Variant } from '../types';
import { VariantCard } from '../components/VariantCard';
import { ComparisonSummary } from '../components/ComparisonSummary';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import styles from './Results.module.css';

export function Results() {
  const { id } = useParams<{ id: string }>();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const breakdownRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!id) return;
    getEvaluation(id)
      .then(setEvaluation)
      .catch(() => setError('Failed to load evaluation.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Page><p>Loading...</p></Page>;
  if (error || !evaluation) return <Page><p className={pageStyles.error}>{error ?? 'Not found'}</p></Page>;

  const sorted = [...evaluation.variants].sort((a, b) => a.rank - b.rank);
  const stores = evaluation.siteSummary?.stores ?? [];
  const isFullSite = evaluation.scanMode === 'FULL_SITE' && stores.length > 0;
  const storeVariants: Variant[] = stores.map((store, index) => {
    const pages = sorted.filter((variant) => variant.siteRootUrl === store.rootUrl);
    const representative = pages.find((variant) => variant.pageType === 'product') ?? pages[0];
    const insight = evaluation.siteSummary?.storeInsights?.find((item) => item.url === store.rootUrl);
    const rawPenalties = pages.flatMap((variant) => variant.rulePenalties)
      .filter((penalty) => penalty.penalty < 0)
      .sort((left, right) => left.penalty - right.penalty);
    const rankedCategories = Object.entries(store.categoryScores).sort(([, left], [, right]) => right - left);
    const categoryStrengths = rankedCategories.slice(0, 3).map(([category, score]) =>
      `${category} was a strong area, scoring ${score.toFixed(1)} out of 100.`,
    );
    const categoryImprovements = rankedCategories.slice(-2).reverse().map(([category, score]) =>
      `${category} was the clearest opportunity for improvement, scoring ${score.toFixed(1)} out of 100.`,
    );
    return {
      id: representative?.id ?? `store-${index}`,
      evaluationId: evaluation.id,
      url: store.rootUrl,
      rank: index + 1,
      totalScore: store.overallScore,
      categoryScores: store.categoryScores as Variant['categoryScores'],
      rulePenalties: insight?.improvements.length
        ? insight.improvements.map((rule, penaltyIndex) => ({ rule, penalty: rawPenalties[penaltyIndex]?.penalty ?? -1 }))
        : categoryImprovements.map((rule) => ({ rule, penalty: -1 })),
      topDrivers: insight?.strengths.length
        ? insight.strengths
        : categoryStrengths,
      features: representative?.features ?? {},
      criterionResults: [],
      siteRootUrl: store.rootUrl,
      pageType: 'store',
    };
  });
  const pageTypes = ['homepage', 'collection', 'product', 'cart', 'checkout', 'search', 'policy']
    .filter((pageType) => sorted.some((variant) => variant.pageType === pageType));

  return (
    <Page>
      <Link to="/" className={pageStyles.backLink}>Back to New Evaluation</Link>
      <PageHeader
        eyebrow="Evaluation complete"
        title="Results"
        description={<>Goal: <strong>{evaluation.goal}</strong> · {evaluation.variants.length} {isFullSite ? 'pages scanned' : 'variants'} · {evaluation.processingTime}ms</>}
        actions={!isFullSite ? <div className={styles.headerActions}><Link to={`/compare?left=${evaluation.id}`}>Compare evaluations ↗</Link></div> : undefined}
      />

      {isFullSite ? (
        <>
          <div className={styles.variantList}>
            {storeVariants.map((variant) => (
              <VariantCard
                key={variant.siteRootUrl}
                variant={variant}
                evaluationId={evaluation.id}
                onViewDetails={() => {
                  if (breakdownRef.current) breakdownRef.current.open = true;
                  breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            ))}
          </div>
          <ComparisonSummary variants={storeVariants} narrative={evaluation.siteSummary?.comparisonNarrative} />
          <details className={styles.pageBreakdown} id="page-breakdowns" ref={breakdownRef}>
            <summary>View page breakdowns</summary>
            <div className={styles.breakdownGroups}>
              {pageTypes.map((pageType) => (
                <section className={styles.breakdownGroup} key={pageType}>
                  <h3>{pageType}</h3>
                  <div className={styles.variantList}>
                    {stores.map((store) => {
                      const page = sorted.find((variant) => variant.siteRootUrl === store.rootUrl && variant.pageType === pageType);
                      if (!page) return <div className={styles.missingPage} key={store.rootUrl}>No {pageType} page was captured for {store.rootUrl}</div>;
                      const pair = stores
                        .map((candidate) => sorted.find((variant) => variant.siteRootUrl === candidate.rootUrl && variant.pageType === pageType))
                        .filter((variant): variant is Variant => Boolean(variant))
                        .sort((a, b) => b.totalScore - a.totalScore);
                      const displayPage = { ...page, rank: pair.findIndex((variant) => variant.id === page.id) + 1 };
                      return <VariantCard key={page.id} variant={displayPage} evaluationId={evaluation.id} />;
                    })}
                  </div>
                </section>
              ))}
            </div>
          </details>
        </>
      ) : (
        <div className={styles.variantList}>
          {sorted.map((variant) => (
            <VariantCard key={variant.id} variant={variant} evaluationId={evaluation.id} />
          ))}
        </div>
      )}
      {evaluation.aiUsage && (
        <p className={styles.aiUsage}>AI usage: {evaluation.aiUsage.requestCount} requests · {evaluation.aiUsage.inputTokens.toLocaleString()} input tokens · {evaluation.aiUsage.outputTokens.toLocaleString()} output tokens · estimated ${evaluation.aiUsage.estimatedCostUsd.toFixed(4)}</p>
      )}
      {!isFullSite && <ComparisonSummary variants={sorted} />}
    </Page>
  );
}
