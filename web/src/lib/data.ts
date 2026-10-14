// 디자인(Life Manager App.dc.html)의 샘플 데이터. Supabase 연동 전까지 목 데이터로 사용한다.

export const L = "oklch(0.9 0.19 125)"; // 포인트(라임)
export const P = "oklch(0.55 0.22 290)"; // 업무(퍼플)
export const R = "oklch(0.75 0.16 25)"; // 경고/초과
export const B = "oklch(0.7 0.12 230)"; // 운동/날씨

export const fmt = (n: number) => n.toLocaleString("ko-KR");

export type DueKind = "over" | "today" | "later" | "none" | "past";
export type TodoStatus = "todo" | "doing" | "done";
export type Todo = {
  id: number;
  title: string;
  due: DueKind;
  dueLabel: string;
  dueFull: string;
  pri: "상" | "중" | "하";
  proj: string;
  tags: string;
  repeat: string;
  status: TodoStatus;
  meta: string;
  notes: string;
  items: [string, 0 | 1][];
};

export const TODOS: Todo[] = [
  { id: 1, title: "관리비 이체", due: "over", dueLabel: "어제", dueFull: "10월 13일 (화)", pri: "상", proj: "생활", tags: "#집 #돈", repeat: "매월 13일", status: "todo", meta: "반복 · 매월", notes: "관리사무소 계좌로 이체. 영수증은 가계부 주거 카테고리에 첨부.", items: [] },
  { id: 2, title: "분기 보고서 초안", due: "today", dueLabel: "오늘", dueFull: "10월 14일 (수)", pri: "상", proj: "업무", tags: "#보고", repeat: "없음", status: "doing", meta: "체크 2/4", notes: "목요일 10시 분기 보고 회의 전에 팀장님께 공유. 3분기 지표는 대시보드 캡처 사용.", items: [["3분기 지표 정리", 1], ["목차 구성", 1], ["리스크 섹션 작성", 0], ["팀장님 공유", 0]] },
  { id: 3, title: "세탁물 찾기", due: "today", dueLabel: "오늘", dueFull: "10월 14일 (수)", pri: "중", proj: "생활", tags: "-", repeat: "없음", status: "todo", meta: "", notes: "19시 전까지.", items: [] },
  { id: 4, title: "우산 챙기기", due: "today", dueLabel: "오늘", dueFull: "10월 14일 (수)", pri: "하", proj: "생활", tags: "-", repeat: "없음", status: "done", meta: "날씨 알림에서 생성", notes: "저녁 비 60% 예보.", items: [] },
  { id: 5, title: "회의 자료 출력", due: "later", dueLabel: "10/15", dueFull: "10월 15일 (목)", pri: "중", proj: "업무", tags: "#보고", repeat: "없음", status: "todo", meta: "", notes: "10부.", items: [] },
  { id: 6, title: "세금계산서 발행", due: "later", dueLabel: "10/16", dueFull: "10월 16일 (금)", pri: "상", proj: "업무", tags: "#돈", repeat: "매월 16일", status: "todo", meta: "반복 · 매월", notes: "거래처 3곳.", items: [] },
  { id: 7, title: "주간 회고 작성", due: "later", dueLabel: "10/16", dueFull: "10월 16일 (금)", pri: "중", proj: "업무", tags: "-", repeat: "매주 금요일", status: "todo", meta: "반복 · 매주", notes: "", items: [] },
  { id: 8, title: "제주 숙소 예약", due: "later", dueLabel: "10/20", dueFull: "10월 20일 (화)", pri: "중", proj: "여행", tags: "#여행", repeat: "없음", status: "doing", meta: "체크 1/3", notes: "애월 쪽, 2박.", items: [["후보 3곳 비교", 1], ["날짜 확정", 0], ["결제", 0]] },
  { id: 9, title: "운동화 교체 알아보기", due: "none", dueLabel: "-", dueFull: "없음", pri: "하", proj: "운동", tags: "-", repeat: "없음", status: "todo", meta: "", notes: "", items: [] },
  { id: 10, title: "기획 리뷰 자료 정리", due: "past", dueLabel: "10/12", dueFull: "10월 12일 (월)", pri: "중", proj: "업무", tags: "-", repeat: "없음", status: "done", meta: "", notes: "", items: [] },
  { id: 11, title: "경비 정산 제출", due: "past", dueLabel: "10/12", dueFull: "10월 12일 (월)", pri: "중", proj: "업무", tags: "#돈", repeat: "없음", status: "done", meta: "", notes: "", items: [] },
];

export const PROJ: Record<string, string> = { 업무: P, 생활: "#8d8d94", 여행: L, 운동: B };
export const PRI: Record<string, [string, string]> = { 상: [R, "#1a0d0a"], 중: ["#3a3a40", "#f2f2f3"], 하: ["#26262a", "#b4b4ba"] };
export const CATC: Record<string, string> = { 주거: P, 식비: "oklch(0.68 0.17 290)", 쇼핑: L, 교통: B, 문화: "oklch(0.45 0.14 290)", 기타: "#55555c", 수입: "#d6d6da", 이체: "#8d8d94" };

export type TxType = "exp" | "inc" | "tr";
export type Tx = [date: string, memo: string, cat: string, acct: string, amt: number, type: TxType, badge?: string];
export const TX: Tx[] = [
  ["10월 14일 (수)", "점심", "식비", "신한카드", 12000, "exp", "Claude"],
  ["10월 14일 (수)", "스타벅스", "식비", "신한카드", 5500, "exp"],
  ["10월 13일 (화)", "프리랜스 정산", "수입", "카카오뱅크", 350000, "inc"],
  ["10월 13일 (화)", "무신사", "쇼핑", "신한카드", 89000, "exp"],
  ["10월 13일 (화)", "지하철", "교통", "카카오뱅크", 1550, "exp"],
  ["10월 12일 (월)", "마트 장보기", "식비", "신한카드", 46200, "exp"],
  ["10월 12일 (월)", "카카오뱅크 → 현금", "이체", "카카오뱅크", 100000, "tr"],
  ["10월 10일 (토)", "영화 · 용산", "문화", "신한카드", 28000, "exp"],
  ["10월 10일 (토)", "택시", "교통", "신한카드", 14300, "exp"],
];

export const TOTAL_EXP = 1642300;
export const CATS: [string, number][] = [["주거", 650000], ["식비", 482000], ["쇼핑", 214000], ["교통", 128400], ["문화", 96000], ["기타", 71900]];
export const BUD: [string, number, number][] = [["식비", 482000, 550000], ["쇼핑", 214000, 200000], ["교통", 128400, 150000], ["문화", 96000, 150000], ["기타", 71900, 150000]];

export type EvKind = "w" | "p" | "x" | "n";
export type RawEvent = [title: string, from: string, to: string, kind: EvKind, g?: string, note?: string];
export const WEEKRAW: [string, number, string, [string, string][], RawEvent[]][] = [
  ["월", 12, "맑음 20°", [], [["스탠드업", "09:30", "10:00", "w", "G"], ["기획 리뷰", "14:00", "15:30", "w"], ["PT", "19:00", "20:00", "x"]]],
  ["화", 13, "구름 19°", [["관리비 이체 · 초과", R]], [["스탠드업", "09:30", "10:00", "w", "G"], ["1:1 미팅", "11:00", "12:00", "w", "G"], ["저녁 · 친구", "18:30", "20:30", "p"]]],
  ["수", 14, "비 60%", [["분기 보고서 초안", L]], [["스탠드업", "09:30", "10:00", "w", "G"], ["점심 · 성수", "12:00", "13:00", "p"], ["치과 정기검진", "15:00", "16:00", "n"], ["러닝 크루 · 한강", "19:30", "21:00", "x", "", "비 60% · 야외"]]],
  ["목", 15, "비 80%", [["넷플릭스 17,000", "#d6d6da"]], [["스탠드업", "09:30", "10:00", "w", "G"], ["분기 보고 회의", "10:00", "12:00", "w", "G"], ["외부 미팅 · 판교", "16:00", "17:00", "w"]]],
  ["금", 16, "구름 17°", [["세금계산서 발행", L]], [["스탠드업", "09:30", "10:00", "w", "G"], ["팀 점심", "13:00", "14:00", "p"], ["회식 · 을지로", "19:00", "22:00", "p"]]],
  ["토", 17, "맑음 18°", [["종일 · 가족 여행 · 가평", "ad"]], [["요가", "10:00", "11:30", "x"], ["전시 관람", "15:00", "18:00", "p"]]],
  ["일", 18, "맑음 19°", [["종일 · 가족 여행 (2/2)", "ad"]], [["가족 브런치", "11:00", "13:00", "p"]]],
];
export const EVC: Record<EvKind | "pay", [string, string]> = { w: [P, "#fff"], p: ["#34343a", "#fff"], x: [B, "#0b0b0c"], n: [L, "#0b0b0c"], pay: ["transparent", "#d6d6da"] };

export const MEV: Record<number, [string, EvKind | "pay"][]> = {
  2: [["월세 650,000", "pay"]], 5: [["추석 연휴", "p"]], 7: [["프로젝트 킥오프", "w"]], 9: [["한글날", "p"]],
  12: [["기획 리뷰", "w"], ["PT", "x"]], 13: [["1:1 미팅", "w"], ["저녁 · 친구", "p"]],
  14: [["치과 15:00", "n"], ["러닝 크루", "x"], ["점심 · 성수", "p"], ["스탠드업", "w"]],
  15: [["분기 보고 회의", "w"], ["넷플릭스 17,000", "pay"], ["외부 미팅", "w"]],
  16: [["회식 · 을지로", "p"], ["팀 점심", "p"]], 17: [["전시 관람", "p"]], 18: [["가족 브런치", "p"]],
  21: [["통신비 59,000", "pay"]], 22: [["제주 여행", "p"]], 23: [["제주 여행", "p"]], 24: [["제주 여행", "p"]],
  28: [["건강검진", "p"]], 30: [["월말 정산", "w"]],
};
export const MWX: Record<number, string> = { 14: "비 60%", 15: "비 80%", 16: "17°", 17: "18°", 18: "19°", 19: "18°", 20: "16°" };

export const NOTIS: [string, string, string, string, string, string][] = [
  ["예산", "쇼핑 예산을 초과했어요", "214,000 / 200,000원 · 107%", "12:45", R, "#1a0d0a"],
  ["우천", "오늘 19시 비 60% 예보", "러닝 크루 · 한강 반포 (야외 일정)", "07:00", B, "#0b0b0c"],
  ["결제", "내일 넷플릭스 결제 예정", "17,000원 · 신한카드", "어제 20:00", "#d6d6da", "#0b0b0c"],
  ["할일", "관리비 이체 기한이 지났어요", "어제 마감 · 상", "어제 09:00", R, "#1a0d0a"],
  ["일정", "1:1 미팅 10분 전", "11:00 · 회의실 B", "화 10:50", P, "#fff"],
  ["동기화", "Google 캘린더 동기화 완료", "새 일정 3개 · 변경 1개", "월 09:12", "#3a3a40", "#f2f2f3"],
];
export const NOTI_SETTINGS: [string, string, string][] = [
  ["ev", "일정 시작", "기본 10분 전 · 일정별 변경 가능"],
  ["todo", "할일 마감", "마감 당일 09:00"],
  ["budget", "예산 80% · 100% 도달", "총예산과 카테고리 예산"],
  ["pay", "결제 예정", "고정지출 결제 하루 전 20:00"],
  ["rain", "우천 예보", "위치 있는 일정 · 강수확률 60% 이상"],
  ["sync", "동기화 오류", "토큰 만료 · 권한 철회 시 재연결 안내"],
];

export type Perm = "rw" | "r" | "none";
export const TOKENS: [string, string, Perm, Perm, Perm, string, 0 | 1][] = [
  ["Claude 데스크톱", "lm_••••3f9a · 9/02 발급", "rw", "rw", "rw", "12:41", 0],
  ["Claude 모바일", "lm_••••a71c · 9/20 발급", "r", "r", "rw", "어제 21:08", 0],
  ["테스트용", "lm_••••0be2 · 8/11 폐기", "r", "none", "none", "8/11", 1],
];
export const MCP_LOGS: [string, string, string, "ok" | "err"][] = [
  ["12:41", "add_transaction", "점심 12,000원 · 식비 · 신한카드", "ok"],
  ["08:52", "create_event", "치과 정기검진 10/14 15:00", "ok"],
  ["08:51", "find_free_time", "10/14 · 60분", "ok"],
  ["08:50", "get_today_overview", "오늘", "ok"],
  ["08:49", "get_weather", "서울", "ok"],
  ["08:47", "add_transaction", '카테고리 "간식" 모호 → 후보 반환', "err"],
];

export const RECURRING: [string, string, string, string, number, string, 0 | 1, string?][] = [
  ["넷플릭스", "매월 15일", "10/15", "신한카드", 17000, "문화", 1, "내일"],
  ["통신비", "매월 21일", "10/21", "신한카드", 59000, "기타", 1],
  ["월세", "매월 1일", "11/01", "신한은행", 650000, "주거", 1],
  ["유튜브 프리미엄", "매월 3일", "11/03", "신한카드", 14900, "문화", 1],
  ["헬스장", "매월 5일", "11/05", "카카오뱅크", 66000, "기타", 1],
  ["클라우드 저장소", "매년 3월 2일", "2027/03/02", "신한카드", 29000, "기타", 0],
];
export const ACCOUNTS: [string, string, string, number, string, string][] = [
  ["은행", "주거래", "신한은행", 2840000, P, "#fff"],
  ["은행", "비상금", "카카오뱅크", 1712500, "#1c1c20", "#f2f2f3"],
  ["현금", "지갑", "현금", 128000, "#1c1c20", "#f2f2f3"],
  ["카드", "10월 사용 · 11/14 결제", "신한카드", -555200, L, "#0b0b0c"],
];
