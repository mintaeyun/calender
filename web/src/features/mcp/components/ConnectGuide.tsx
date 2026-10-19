"use client";

import { useState, type ReactNode } from "react";

const tab = (on: boolean) => `rounded-full px-4 py-2 text-sm ${on ? "bg-surface-5 font-semibold text-fg" : "bg-surface-3 text-fg-muted"}`;
const box = "flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 text-sm";

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg-muted marker:text-fg-subtle">{children}</ol>;
}

/** 설정 > MCP 연결의 사용 방법 안내 (Claude / ChatGPT 연결, 범위, 추천 설정, 예시, 문제 해결) */
export function ConnectGuide({ url }: { url: string | null }) {
  const [app, setApp] = useState<"claude" | "chatgpt">("claude");
  const addr = url ?? "(서버 주소)";

  return (
    <div className="flex flex-col gap-4" aria-label="연결 방법 안내">
      <div role="tablist" aria-label="연결할 앱" className="flex gap-2">
        <button role="tab" aria-selected={app === "claude"} className={tab(app === "claude")} onClick={() => setApp("claude")}>Claude에 연결하기</button>
        <button role="tab" aria-selected={app === "chatgpt"} className={tab(app === "chatgpt")} onClick={() => setApp("chatgpt")}>ChatGPT에 연결하기</button>
      </div>

      {app === "claude" ? (
        <div role="tabpanel" className={box}>
          <Steps>
            <li>claude.ai(웹) 또는 Claude 데스크톱 앱에 로그인합니다.</li>
            <li><b>Customize &gt; Connectors &gt; Add custom connector</b>를 엽니다.</li>
            <li>이름(예: 라이프 매니저)과 <b>MCP server URL</b>에 위의 서버 주소 <code className="break-all">{addr}</code>를 입력합니다.</li>
            <li>인증은 <b>Sign in now</b>, OAuth 클라이언트는 기본값(자동 등록 또는 Claude 기본 신원)을 그대로 두고 <b>Add</b>를 누릅니다.</li>
            <li><b>Connect</b>를 누르면 라이프 매니저의 승인 화면이 열립니다. 로그인 후 <b>서비스별 허용 범위</b>를 고르고 <b>허용하고 연결</b>을 누릅니다.</li>
            <li>대화창의 <b>+ &gt; Connectors</b>에서 라이프 매니저를 켜면 사용할 수 있습니다. 모바일 앱은 같은 계정으로 등록된 커넥터를 그대로 씁니다.</li>
          </Steps>
          <p className="text-xs text-fg-subtle">OAuth 대신 토큰을 직접 쓰고 싶다면(계정에 <b>Request headers</b> 입력란이 있을 때만): 인증을 <b>No sign-in</b>으로 두고 헤더 <code>authorization</code> 값에 <code>Bearer lm_…</code>(아래에서 발급한 토큰)을 넣습니다.</p>
        </div>
      ) : (
        <div role="tabpanel" className={box}>
          <Steps>
            <li>ChatGPT 웹(chatgpt.com)에 로그인합니다. 커스텀 MCP 서버는 요금제·워크스페이스 설정에 따라 보이지 않을 수 있어요(회사/팀 계정은 관리자 허용 필요).</li>
            <li><b>Plugins</b>(플러그인)로 들어가 <b>+</b> 버튼 → <b>Add custom MCP server</b>를 선택합니다. 메뉴 이름은 ChatGPT 업데이트에 따라 달라질 수 있어요.</li>
            <li>이름(예: 라이프 매니저)과 <b>Server URL</b>에 위의 서버 주소 <code className="break-all">{addr}</code>를 입력합니다.</li>
            <li>인증은 <b>OAuth</b>를 선택합니다. 클라이언트 ID/시크릿은 비워 두면 자동으로 등록됩니다.</li>
            <li>위험 경고를 읽고 <b>I understand and want to continue</b> → <b>Create as a plugin</b>을 누른 뒤 설치합니다.</li>
            <li>연결을 시작하면 라이프 매니저의 승인 화면이 열립니다. 로그인 후 <b>서비스별 허용 범위</b>를 고르고 <b>허용하고 연결</b>을 누릅니다.</li>
            <li>대화에서 플러그인을 켜고 사용합니다. 쓰기 도구는 ChatGPT가 실행 전에 확인을 물어볼 수 있어요.</li>
          </Steps>
          <p className="text-xs text-fg-subtle">ChatGPT 커스텀 MCP 서버의 인증은 OAuth 또는 인증 없음만 지원합니다(토큰 헤더 입력란 없음). 인증 없음으로는 연결하지 마세요 — 서버가 401로 거절합니다.</p>
        </div>
      )}

      <div className={box}>
        <b>허용 범위 (서비스별)</b>
        <ul className="flex flex-col gap-1 text-fg-muted">
          <li><b>일정 · 할일 · 가계부</b>를 각각 <b>없음 / 읽기 / 읽기·쓰기</b> 중에서 고릅니다.</li>
          <li><b>읽기</b>: 조회·검색·요약만. <b>읽기·쓰기</b>: 만들기·수정·완료·삭제까지.</li>
          <li>삭제는 항상 앱(Claude·ChatGPT)이 먼저 확인을 묻고, 한 번에 하나만 지웁니다. 일괄 삭제는 없어요. 반복 일정의 수정·삭제는 웹에서 해야 합니다.</li>
        </ul>
        <p className="rounded-xl bg-surface-3 px-3 py-2 text-fg-muted">추천: 처음에는 <b>모두 읽기</b>로 연결해 써 보고, 필요한 서비스만 나중에 읽기·쓰기로 올리세요. 범위를 바꾸려면 연결을 끊고 다시 연결하면 됩니다.</p>
      </div>

      <div className={box}>
        <b>이렇게 말해 보세요</b>
        <ul className="flex flex-col gap-1 text-fg-muted">
          <li><b>일정</b> · "이번 주 일정 알려줘" · "내일 오후 3시에 치과 일정 잡아줘" · "다음 주에 1시간 비는 시간 찾아줘"</li>
          <li><b>할일</b> · "오늘 마감인 할일 보여줘" · "보고서 초안 작성 할일 추가해줘, 금요일까지" · "청소 할일 완료로 바꿔줘"</li>
          <li><b>가계부</b> · "점심 12,000원 식비 신한카드로 기록해줘" · "이번 달 식비 얼마 썼어?" · "계좌별 잔액 알려줘"</li>
          <li><b>한 번에</b> · "오늘 브리핑해줘" (일정·할일·날씨·지출 요약)</li>
        </ul>
      </div>

      <div className={box}>
        <b>토큰·연결 관리</b>
        <ul className="flex flex-col gap-1 text-fg-muted">
          <li>OAuth로 연결하면 아래 <b>연결 목록</b>에 앱 이름과 함께 나타납니다. 직접 만든 토큰도 같은 목록에 보입니다.</li>
          <li>직접 만든 토큰은 <b>발급 직후 한 번만</b> 전체 값을 볼 수 있어요. 창을 닫으면 다시 볼 수 없으니 바로 복사하세요.</li>
          <li><b>폐기</b>(연결 끊기)를 누르면 그 연결이 즉시 중단됩니다. 앱에서 다시 연결하면 새로 승인할 수 있어요.</li>
        </ul>
      </div>

      <div className={box}>
        <b>문제 해결</b>
        <ul className="flex flex-col gap-1 text-fg-muted">
          <li><b>401 / "연결이 끊겼어요"</b>: 연결이 폐기·만료되었거나 토큰이 틀렸어요. 앱에서 커넥터를 다시 연결하세요(직접 토큰은 새로 발급해 다시 등록).</li>
          <li><b>429</b>: 연결당 분당 호출 한도를 넘었어요. 표시된 시간(초) 뒤에 다시 시도하세요.</li>
          <li><b>"후보: …" 오류</b>: 카테고리·계좌·프로젝트 이름이 모호하거나 없어요. 후보 중 하나를 정확히 말해 주세요.</li>
          <li><b>도구가 안 보여요</b>: 허용 범위에 해당 서비스가 없어요. 범위를 넓혀 다시 연결하세요.</li>
          <li><b>승인 화면이 열리지 않아요</b>: 앱을 배포한 공개 주소(https)에서만 연결할 수 있어요. 로컬 개발 주소로는 ChatGPT·Claude가 접근할 수 없습니다.</li>
        </ul>
      </div>
    </div>
  );
}
