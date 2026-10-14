import { json } from "./cors.ts";

/** 오류 응답 형식: { error: { code, message, details? } } */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "로그인이 필요합니다.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "권한이 없습니다.") => new HttpError(403, "forbidden", message);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const notFound = (message = "찾을 수 없습니다.") => new HttpError(404, "not_found", message);

/** 핸들러의 catch 에서 사용. 예상 밖 오류는 상세를 숨기고 서버 로그에만 남긴다. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error(err);
  return json({ error: { code: "internal", message: "서버 오류가 발생했습니다." } }, 500);
}
