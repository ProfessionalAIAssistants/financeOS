import { useQuery as useTanstackQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

// Re-export with cleaner interface
export { useQueryClient, useMutation };

export function useQuery<T>(
  key: unknown[],
  fetcher: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>
) {
  return useTanstackQuery<T, Error>({
    queryKey: key,
    queryFn: fetcher,
    staleTime: 60_000,       // 1 minute
    refetchInterval: 120_000, // auto-refresh every 2 minutes
    retry: 2,
    ...options,
  });
}
