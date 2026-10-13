import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface LeaveGuards {
  readonly form: string | undefined;
  readonly register: (form: string) => () => void;
}

const LeaveGuardContext = createContext<LeaveGuards>({
  form: undefined,
  register: () => () => undefined,
});

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const [forms, setForms] = useState<readonly string[]>([]);
  const register = useCallback((form: string) => {
    setForms((list) => [...list, form]);
    return () => {
      setForms((list) => {
        const index = list.indexOf(form);
        return index < 0
          ? list
          : [...list.slice(0, index), ...list.slice(index + 1)];
      });
    };
  }, []);
  const value = useMemo(
    () => ({ form: forms.at(-1), register }),
    [forms, register],
  );
  return <LeaveGuardContext value={value}>{children}</LeaveGuardContext>;
}

// A form with unsent input names itself, e.g. «Форма поставки»; the
// restaurant switcher then asks first (W10). Forms join in later subprojects.
export function useLeaveGuard(form: string | undefined): void {
  const { register } = useContext(LeaveGuardContext);
  useEffect(
    () => (form === undefined ? undefined : register(form)),
    [form, register],
  );
}

export function useUnsavedForm(): string | undefined {
  return useContext(LeaveGuardContext).form;
}
