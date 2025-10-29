// Permite importar el worker en ESM sin que TS se queje
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const src: string;
  export default src;
}