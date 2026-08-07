import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DataEnvelope } from "../market/apiDomain";

export interface ResearchRequest<T> {
  envelope?: DataEnvelope<T>;
  error?: unknown;
  loading: boolean;
  retry: () => void;
}

export function useResearchRequest<T>(
  key: string,
  dependency: unknown,
  load: () => Promise<DataEnvelope<T>>,
): ResearchRequest<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [revision, setRevision] = useState(0);
  const [envelope, setEnvelope] = useState<DataEnvelope<T>>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setEnvelope(undefined);
    void loadRef.current()
      .then((result) => { if (active) setEnvelope(result); })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key, dependency, revision]);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { envelope, error, loading, retry };
}

export function ResearchDataSection<T>({
  title,
  request,
  errorMessage,
  emptyMessage,
  children,
}: {
  title: string;
  request: ResearchRequest<T>;
  errorMessage: string;
  emptyMessage?: string;
  children: (data: T, envelope: DataEnvelope<T>) => ReactNode;
}) {
  return (
    <section className="research-data-section">
      <h2>{title}</h2>
      {request.loading && <p role="status">正在加载{title}</p>}
      {request.error !== undefined && (
        <p role="alert">
          {errorMessage} <button type="button" onClick={request.retry}>重试</button>
        </p>
      )}
      {request.envelope && (
        <>
          <p className="research-data-meta">
            {request.envelope.source} · {new Date(request.envelope.asOf).toLocaleString()}
            {request.envelope.stale ? " · 旧缓存" : ""}
          </p>
          {Array.isArray(request.envelope.data) && request.envelope.data.length === 0 && emptyMessage
            ? <p>{emptyMessage}</p>
            : children(request.envelope.data, request.envelope)}
        </>
      )}
    </section>
  );
}
