export async function ensurePdfWorker() {
  const { GlobalWorkerOptions } = await import('pdfjs-dist')
  ;(GlobalWorkerOptions as any).workerSrc = '/pdf.worker.min.mjs'
}
