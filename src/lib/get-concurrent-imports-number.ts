export function getConcurrentImportsNumber(): number {
  let importsNumber = parseInt(process.env.CONCURRENT_IMPORTS || '15');
  if (importsNumber > 40) {
    // never more than 40!
    importsNumber = 40;
  }
  return importsNumber;
}
