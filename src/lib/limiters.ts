import Bottleneck from 'bottleneck';

export async function limiterForScm(
  maxConcurrent: number,
  minTime: number,
  reservoir?: number,
  reservoirRefreshAmount?: number,
  reservoirRefreshInterval?: number,
): Promise<Bottleneck> {
  return new Bottleneck({
    reservoir: reservoir,
    reservoirRefreshAmount: reservoirRefreshAmount,
    reservoirRefreshInterval: reservoirRefreshInterval,
    maxConcurrent: maxConcurrent,
    minTime: minTime,
  });
}
