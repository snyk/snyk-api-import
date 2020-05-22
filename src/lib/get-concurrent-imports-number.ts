export function getConcurrentImportsNumber(): number {
  let importsNumber = parseInt(process.env.CONCURRENT_IMPORTS || '5');
  if (importsNumber > 20) {
    // never more than 20!
    importsNumber = 20;
  }
  return importsNumber;
}
