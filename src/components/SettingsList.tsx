import React, { useEffect, useRef } from 'react';
import { ArrowRight, ChevronLeft, type LucideIcon } from 'lucide-react';

export interface SettingsListItem {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: 'blue' | 'teal' | 'gold' | 'violet' | 'rose';
  description?: string;
  count?: number;
  onClick: () => void;
}
export function SettingsList({ items }: { items: SettingsListItem[] }) {
  return <div className="settings-list">{items.map(({ id, label, icon: Icon, tone = 'blue', description, count, onClick }) =>
    <button key={id} type="button" className="settings-row" onClick={onClick}>
      <span className={`settings-icon settings-icon-${tone}`}><Icon aria-hidden="true" size={26}/>{!!count && <span className="settings-count">{count}</span>}</span>
      <span className="settings-row-copy"><span>{label}</span>{description && <small>{description}</small>}</span>
      <ChevronLeft className="settings-chevron" size={19} aria-hidden="true"/>
    </button>
  )}</div>;
}
export function SettingsPage({ title, onBack, children, subpage = false }: { title: string; onBack: () => void; children: React.ReactNode; subpage?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); heading.current?.focus({ preventScroll: true }); }, [title]);
  return <section className="settings-page" dir="rtl" data-settings-subpage={subpage || undefined}>
    <div className="settings-page-heading"><button type="button" className="settings-back" aria-label="رجوع" onClick={onBack}><ArrowRight size={22}/></button><h1 ref={heading} tabIndex={-1}>{title}</h1><span aria-hidden="true"/></div>
    {children}
  </section>;
}
