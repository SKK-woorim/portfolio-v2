import { CheckCircle2, ShieldCheck } from "lucide-react";

const checks = [
  "staging과 production Supabase 프로젝트가 분리되어 있는지 확인",
  "Netlify Preview와 Production 환경 변수에 서로 다른 Supabase 값을 설정",
  "Supabase 대시보드에서 공개 회원가입을 비활성화하고 최초 관리자에 admin 역할 부여",
  "Sentry DSN과 알림 수신자를 설정하고 오류 알림 테스트",
  "데이터베이스 백업과 Storage 파일 복구 절차를 운영 문서에 따라 점검",
];
export default function AdminSettingsPage() { return <div className="mx-auto max-w-4xl"><p className="eyebrow">Operations</p><h1 className="display mt-3 text-4xl">설정 및 운영</h1><p className="mt-3 text-sm text-[var(--body)]">비밀값은 이 화면이 아니라 Netlify와 Supabase 대시보드에서 관리합니다.</p><section className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><div className="flex items-center gap-3"><ShieldCheck className="text-[var(--primary)]" /><h2 className="text-lg font-semibold">출시 전 체크리스트</h2></div><ul className="mt-6 grid gap-4">{checks.map((check) => <li className="flex gap-3 text-sm leading-6 text-[var(--body)]" key={check}><CheckCircle2 className="mt-0.5 shrink-0 text-[var(--primary)]" size={18} />{check}</li>)}</ul></section><p className="mt-6 text-sm text-[var(--body)]">자세한 설정 순서는 저장소의 <code>docs/operations/initial-setup.md</code>를 확인하세요.</p></div>; }
