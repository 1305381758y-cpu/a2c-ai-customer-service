import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

type MetricCardProps = {
  title: string;
  value: number | string;
  detail: string;
  icon?: LucideIcon;
};

export function MetricCard({ title, value, detail, icon: Icon = Sparkles }: MetricCardProps) {
  return <section className="metric-card">
    <div className="metric-top"><span>{title}</span><i><Icon size={19}/></i></div>
    <strong>{value}</strong>
    <small>{detail}</small>
  </section>;
}
