"use client";

import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTimezone } from "@/lib/profile";
import { triggerPush } from "@/features/google/push";
import {
  deleteEvent, listCalendars, listEvents, listRecurringPayments, listTodoDeadlines, saveEvent,
  type DeleteArgs, type EventWithReminders, type SaveArgs,
} from "./api";
import { expandEvents, type DateRange, type EventInstance } from "./lib/recurrence";

/** 쿼리 키 규칙: [영역, 대상, 파라미터] */
export const eventsKey = (range: DateRange) => ["events", "range", range.start.toISOString(), range.end.toISOString()] as const;
export const calendarsKey = ["calendars", "list"] as const;

export const eventsQueryOptions = (range: DateRange) => ({
  queryKey: eventsKey(range),
  queryFn: () => listEvents(range),
  staleTime: 60_000,
});

export function useCalendars() {
  return useQuery({ queryKey: calendarsKey, queryFn: listCalendars, staleTime: 5 * 60_000 });
}

/** 범위의 일정 행 (반복 전개 전) */
export function useEventRows(range: DateRange) {
  return useQuery({ ...eventsQueryOptions(range), placeholderData: keepPreviousData });
}

/** 범위에 보이는 발생들 (반복 전개 완료, 사용자 시간대 기준) */
export function useEvents(range: DateRange) {
  const tz = useTimezone();
  const q = useEventRows(range);
  const instances = useMemo<EventInstance[]>(
    () => (q.data ? expandEvents(q.data, range, tz) : []),
    [q.data, range, tz],
  );
  return { instances, rows: q.data as EventWithReminders[] | undefined, isLoading: q.isLoading, isFetching: q.isFetching, error: q.error };
}

export function useTodoDeadlines(startKey: string, endKey: string, enabled: boolean) {
  return useQuery({
    queryKey: ["todos", "deadlines", startKey, endKey],
    queryFn: () => listTodoDeadlines(startKey, endKey),
    enabled,
    staleTime: 60_000,
  });
}

export function useRecurringPayments(enabled: boolean) {
  return useQuery({ queryKey: ["recurring-payments", "active"], queryFn: listRecurringPayments, enabled, staleTime: 5 * 60_000 });
}

export function useEventMutations() {
  const qc = useQueryClient();
  // 저장·삭제·이동 뒤에는 목록을 다시 불러오고, 구글과 양방향이면 변경을 구글(mycal)로 보낸다(실패해도 다음 동기화가 보낸다).
  const invalidate = () => {
    triggerPush(qc);
    return qc.invalidateQueries({ queryKey: ["events"] });
  };

  const save = useMutation({
    mutationFn: (args: Omit<SaveArgs, "tz"> & { tz: string }) => saveEvent(args),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (args: DeleteArgs) => deleteEvent(args),
    onSuccess: invalidate,
  });

  /**
   * 드래그 이동·크기 조절용 낙관적 저장.
   * 단순 행 수정(비반복 일정)은 캐시를 먼저 바꾸고, 실패하면 되돌린다. 반복 일정은 저장 후 다시 불러온다.
   */
  const move = useMutation({
    mutationFn: (args: Omit<SaveArgs, "tz"> & { tz: string }) => saveEvent(args),
    onMutate: async (args) => {
      const id = args.instance?.event.id;
      if (!id || args.instance?.recurring) return { snapshots: [] as [readonly unknown[], unknown][] };
      await qc.cancelQueries({ queryKey: ["events"] });
      const snapshots = qc.getQueriesData<EventWithReminders[]>({ queryKey: ["events"] }) as [readonly unknown[], unknown][];
      qc.setQueriesData<EventWithReminders[]>({ queryKey: ["events"] }, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, start_at: args.fields.start_at, end_at: args.fields.end_at } : r)),
      );
      return { snapshots };
    },
    onError: (_e, _a, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: invalidate,
  });

  return { save, remove, move };
}
