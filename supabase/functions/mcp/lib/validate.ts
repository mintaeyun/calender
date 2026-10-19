// 도구 입력 검증 (MCP-7). 필요한 JSON Schema 부분집합만 지원: object/string/integer/number/boolean/array/enum/format.
// 알 수 없는 필드는 거부하고, 오류는 한국어로 돌려준다.

export type Schema = {
  type: "object" | "string" | "integer" | "number" | "boolean" | "array";
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number)[];
  items?: Schema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  format?: "date" | "date-time" | "date-or-time" | "uuid";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validate(schema: Schema, value: unknown, path = "입력"): string[] {
  const errors: string[] = [];
  const bad = (m: string) => errors.push(`${path}: ${m}`);

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        bad("객체여야 합니다.");
        return errors;
      }
      const obj = value as Record<string, unknown>;
      const props = schema.properties ?? {};
      for (const r of schema.required ?? []) {
        if (obj[r] === undefined || obj[r] === null) errors.push(`${path}.${r}: 필수 항목입니다.`);
      }
      for (const [k, v] of Object.entries(obj)) {
        if (!(k in props)) {
          if (schema.additionalProperties !== true) {
            errors.push(`${path}.${k}: 알 수 없는 필드입니다. 사용 가능: ${Object.keys(props).join(", ")}`);
          }
          continue;
        }
        if (v === undefined || v === null) continue;
        errors.push(...validate(props[k], v, `${path}.${k}`));
      }
      return errors;
    }
    case "string": {
      if (typeof value !== "string") {
        bad("문자열이어야 합니다.");
        return errors;
      }
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) bad("비어 있을 수 없습니다.");
      if (schema.maxLength !== undefined && value.length > schema.maxLength) bad(`${schema.maxLength}자 이하여야 합니다.`);
      if (schema.enum && !schema.enum.includes(value)) bad(`다음 중 하나여야 합니다: ${schema.enum.join(", ")}`);
      if (schema.format === "date" && !(DATE_RE.test(value) && !Number.isNaN(Date.parse(value)))) {
        bad("YYYY-MM-DD 형식의 날짜여야 합니다.");
      }
      if (schema.format === "date-time" && !(DATETIME_RE.test(value) && !Number.isNaN(Date.parse(value)))) {
        bad("ISO 8601 날짜·시간이어야 합니다. 예: 2026-10-15T15:00:00+09:00");
      }
      if (schema.format === "date-or-time" && !((DATE_RE.test(value) || DATETIME_RE.test(value)) && !Number.isNaN(Date.parse(value)))) {
        bad("YYYY-MM-DD 날짜 또는 ISO 8601 날짜·시간이어야 합니다. 예: 2026-10-15 또는 2026-10-15T15:00:00+09:00");
      }
      if (schema.format === "uuid" && !UUID_RE.test(value)) bad("UUID 형식이어야 합니다.");
      return errors;
    }
    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        bad("숫자여야 합니다.");
        return errors;
      }
      if (schema.type === "integer" && !Number.isInteger(value)) bad("정수여야 합니다.");
      if (schema.minimum !== undefined && value < schema.minimum) bad(`${schema.minimum} 이상이어야 합니다.`);
      if (schema.maximum !== undefined && value > schema.maximum) bad(`${schema.maximum} 이하여야 합니다.`);
      if (schema.enum && !schema.enum.includes(value)) bad(`다음 중 하나여야 합니다: ${schema.enum.join(", ")}`);
      return errors;
    }
    case "boolean":
      if (typeof value !== "boolean") bad("true 또는 false여야 합니다.");
      return errors;
    case "array": {
      if (!Array.isArray(value)) {
        bad("배열이어야 합니다.");
        return errors;
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) bad(`최대 ${schema.maxItems}개까지 가능합니다.`);
      if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items!, v, `${path}[${i}]`)));
      return errors;
    }
  }
}
