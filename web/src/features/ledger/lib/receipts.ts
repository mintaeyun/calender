// 영수증 첨부 규칙(LED-9): 거래당 최대 3장, 이미지 파일만, 용량 제한 후 압축. 순수 로직.

export const MAX_RECEIPTS = 3;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 원본 10MB 초과는 거부
export const MAX_EDGE_PX = 1600;                  // 압축 시 긴 변 기준
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** 첨부 가능 여부 검사. 오류 문구 또는 null. */
export function validateReceipt(file: { type: string; size: number }, currentCount: number): string | null {
  if (currentCount >= MAX_RECEIPTS) return `영수증은 거래당 최대 ${MAX_RECEIPTS}장까지 첨부할 수 있어요`;
  if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) return "이미지 파일(JPG, PNG, WEBP, HEIC)만 첨부할 수 있어요";
  if (file.size <= 0) return "빈 파일이에요";
  if (file.size > MAX_UPLOAD_BYTES) return "파일이 너무 커요 (10MB 이하)";
  return null;
}

/** 긴 변이 max 이하가 되도록 비율을 유지해 줄인 크기. 이미 작으면 그대로. */
export function fitWithin(width: number, height: number, max = MAX_EDGE_PX): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Storage 경로: `<user_id>/<transaction_id>/<고유이름>.jpg` (정책은 첫 폴더가 user_id 인 객체만 허용) */
export const receiptPath = (userId: string, transactionId: string, name: string) => `${userId}/${transactionId}/${name}.jpg`;

/** 경로가 해당 사용자의 것인지(첫 폴더 = user_id) */
export const isOwnPath = (path: string, userId: string) => path.split("/")[0] === userId;
