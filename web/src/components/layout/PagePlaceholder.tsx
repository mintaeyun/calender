/** 소유 세션이 실제 화면으로 교체하기 전까지 쓰는 빈 껍데기 */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[30px] leading-[1.3]">{title}</h1>
      <p className="text-fg-subtle">준비 중입니다.</p>
    </div>
  );
}
