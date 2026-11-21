import { computeSchedule, describeOpening } from './schedule';

const TZ = 'America/Sao_Paulo';
const weekly = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: '08:00', closesAt: '18:00' })),
  { weekday: 6, opensAt: '08:00', closesAt: '12:00' },
];
// 03/11/2026 é terça-feira; São Paulo está em UTC-3.
const at = (iso: string) => new Date(iso);

describe('computeSchedule', () => {
  it('reconhece loja aberta em dia útil', () => {
    const s = computeSchedule(TZ, weekly, [], at('2026-11-03T10:00:00-03:00'));
    expect(s.isOpen).toBe(true);
    expect(s.closesAt?.hour).toBe(18);
  });

  it('terça de madrugada abre hoje às 8h', () => {
    const now = at('2026-11-03T02:54:00-03:00');
    const s = computeSchedule(TZ, weekly, [], now);
    expect(s.isOpen).toBe(false);
    expect(describeOpening(s.nextOpening!, now)).toBe('hoje, às 8h');
  });

  it('sábado à tarde abre segunda às 8h', () => {
    const now = at('2026-11-07T13:00:00-03:00');
    const s = computeSchedule(TZ, weekly, [], now);
    expect(s.isOpen).toBe(false);
    expect(s.nextOpening?.toISODate()).toBe('2026-11-09');
    expect(describeOpening(s.nextOpening!, now)).toBe('segunda-feira, às 8h');
  });

  it('sexta depois das 18h abre sábado às 8h', () => {
    const now = at('2026-11-06T19:00:00-03:00');
    const s = computeSchedule(TZ, weekly, [], now);
    expect(describeOpening(s.nextOpening!, now)).toBe('amanhã, às 8h');
  });

  it('exceção de feriado tem prioridade sobre a grade semanal', () => {
    const now = at('2026-11-14T13:00:00-03:00'); // sábado
    const s = computeSchedule(TZ, weekly, [{ localDate: '2026-11-16', closed: true }], now);
    expect(s.nextOpening?.toISODate()).toBe('2026-11-17');
  });

  it('horário especial numa data substitui o expediente do dia', () => {
    const now = at('2026-11-15T20:00:00-03:00'); // domingo
    const s = computeSchedule(TZ, weekly, [{ localDate: '2026-11-16', closed: false, opensAt: '13:30', closesAt: '17:00' }], now);
    expect(describeOpening(s.nextOpening!, now)).toBe('amanhã, às 13h30');
  });

  it('considera múltiplos turnos (intervalo de almoço)', () => {
    const split = [
      { weekday: 2, opensAt: '08:00', closesAt: '12:00' },
      { weekday: 2, opensAt: '13:00', closesAt: '18:00' },
    ];
    const s = computeSchedule(TZ, split, [], at('2026-11-03T12:30:00-03:00'));
    expect(s.isOpen).toBe(false);
    expect(s.nextOpening?.hour).toBe(13);
  });

  it('sem agenda válida não inventa previsão', () => {
    const s = computeSchedule(TZ, [], [], at('2026-11-03T10:00:00-03:00'));
    expect(s.isOpen).toBe(false);
    expect(s.nextOpening).toBeNull();
  });
});
