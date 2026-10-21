export type OnlineEvent =
  | { type: 'teacher_online'; teacher: any }
  | { type: 'teacher_offline'; teacherId: string }
  | { type: 'snapshot'; teachers: any[] };

const subscribers = new Set<(event: OnlineEvent) => void>();

export function broadcast(event: OnlineEvent) {
  subscribers.forEach((fn) => {
    try {
      fn(event);
    } catch {}
  });
}

export function addSubscriber(fn: (event: OnlineEvent) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function triggerOnlineChange(teacherId: string, isOnline: boolean, data?: any) {
  if (isOnline) {
    broadcast({ type: 'teacher_online', teacher: data || { id: teacherId } });
  } else {
    broadcast({ type: 'teacher_offline', teacherId });
  }
}
