// 영수증 Storage 호출(LED-9). 버킷 `receipts`는 비공개이며 서명 URL로만 보여준다.
// 업로드 전에 캔버스로 긴 변 1600px JPEG(품질 0.8)로 압축한다. 파일 삭제는 DB 행 삭제로는 지워지지 않으므로 항상 함께 처리한다.
import { createClient } from "@/lib/supabase/client";
import { fitWithin, isOwnPath, receiptPath, validateReceipt } from "./lib/receipts";

const BUCKET = "receipts";
const SIGNED_URL_SECONDS = 3600;

export type Receipt = { id: string; transaction_id: string; storage_path: string; created_at: string };
export type ReceiptView = Receipt & { url: string | null };

async function uid(): Promise<string> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session) throw new Error("로그인이 필요해요");
  return data.session.user.id;
}

/** 거래의 영수증 + 서명 URL (1시간). */
export async function listReceipts(transactionId: string): Promise<ReceiptView[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("receipts").select("id, transaction_id, storage_path, created_at").eq("transaction_id", transactionId).order("created_at");
  if (error) throw new Error(error.message);
  if (!data.length) return [];
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(data.map((r) => r.storage_path), SIGNED_URL_SECONDS);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
}

/** 여러 거래의 영수증 개수(내역 목록의 📎 표시용). */
export async function receiptCounts(transactionIds: string[]): Promise<Map<string, number>> {
  const supabase = createClient();
  const out = new Map<string, number>();
  for (let i = 0; i < transactionIds.length; i += 150) {
    const { data, error } = await supabase.from("receipts").select("transaction_id").in("transaction_id", transactionIds.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const r of data) out.set(r.transaction_id, (out.get(r.transaction_id) ?? 0) + 1);
  }
  return out;
}

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // HEIC 등 브라우저가 못 읽으면 여기서 실패 → 호출 측에서 안내
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  if (!blob) throw new Error("이미지를 변환하지 못했어요");
  return blob;
}

/** 영수증 추가. 개수 제한은 클라이언트(validateReceipt)와 DB 트리거(최대 3장) 양쪽에서 막는다. */
export async function addReceipt(transactionId: string, file: File, currentCount: number): Promise<void> {
  const problem = validateReceipt(file, currentCount);
  if (problem) throw new Error(problem);
  let blob: Blob;
  try { blob = await compress(file); } catch { throw new Error("이 이미지는 읽을 수 없어요. JPG나 PNG로 다시 시도해 주세요"); }
  const supabase = createClient();
  const path = receiptPath(await uid(), transactionId, crypto.randomUUID());
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw new Error("업로드에 실패했어요");
  const ins = await supabase.from("receipts").insert({ user_id: await uid(), transaction_id: transactionId, storage_path: path });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]); // DB 기록 실패(예: 3장 초과) 시 고아 파일을 남기지 않는다
    throw new Error(/limit/i.test(ins.error.message) ? "영수증은 거래당 최대 3장까지 첨부할 수 있어요" : ins.error.message);
  }
}

/** 영수증 1장 삭제: 파일 먼저, 그다음 DB 행. */
export async function deleteReceipt(r: Pick<Receipt, "id" | "storage_path">): Promise<void> {
  const supabase = createClient();
  const rm = await supabase.storage.from(BUCKET).remove([r.storage_path]);
  if (rm.error) throw new Error("파일을 삭제하지 못했어요");
  const del = await supabase.from("receipts").delete().eq("id", r.id);
  if (del.error) throw new Error(del.error.message);
}

/** 거래 삭제 전에 호출: 그 거래의 영수증 파일을 모두 지운다(DB 행은 거래 삭제 시 cascade). */
export async function removeReceiptFilesOfTransaction(transactionId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from("receipts").select("storage_path").eq("transaction_id", transactionId);
  if (error) throw new Error(error.message);
  if (!data.length) return;
  const rm = await supabase.storage.from(BUCKET).remove(data.map((r) => r.storage_path));
  if (rm.error) throw new Error("영수증 파일을 삭제하지 못했어요");
}

/**
 * 계정 삭제 전에 호출(01 `lib/auth.ts deleteAccount`): 내 `receipts/<user_id>/` 아래 모든 파일을 지운다.
 * DB 행은 계정 삭제 cascade 로 사라지지만 Storage 파일은 남기 때문에 먼저 처리해야 한다.
 * 폴더 구조: <user_id>/<transaction_id>/<파일>
 */
export async function removeAllMyReceiptFiles(): Promise<number> {
  const supabase = createClient();
  const userId = await uid();
  const files: string[] = [];
  const { data: folders, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const f of folders ?? []) {
    // 폴더는 id 가 null 인 항목
    if (f.id === null) {
      const { data: inner } = await supabase.storage.from(BUCKET).list(`${userId}/${f.name}`, { limit: 1000 });
      for (const o of inner ?? []) if (o.id !== null) files.push(`${userId}/${f.name}/${o.name}`);
    } else {
      files.push(`${userId}/${f.name}`);
    }
  }
  const own = files.filter((p) => isOwnPath(p, userId));
  for (let i = 0; i < own.length; i += 100) {
    const rm = await supabase.storage.from(BUCKET).remove(own.slice(i, i + 100));
    if (rm.error) throw new Error("영수증 파일을 삭제하지 못했어요");
  }
  return own.length;
}
