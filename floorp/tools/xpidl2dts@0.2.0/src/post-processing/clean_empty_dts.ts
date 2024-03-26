/**
 * Check the dts'ified IDL file not supporting javascript
 * @param src the Source string
 * @returns is not supporting javascript
 */
export function isEmpty(src: string): boolean {
  let _src = src + "\n";
  _src = _src.replaceAll(/\/\*[\S\s]+?\*\//g, "");
  _src = _src.replaceAll(/\/\/.*\n/g, "");

  _src = _src.replaceAll(/[ \n]/g, "");
  return _src.trim() === "";
}
