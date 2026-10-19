// CSV 파일 바이트 → 문자열. 한국 은행/카드사 CSV 는 UTF-8 이 아니라 CP949(EUC-KR)인 경우가 많다.
export function decodeCsvBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf); // BOM 은 parseCsv 가 제거한다
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}
