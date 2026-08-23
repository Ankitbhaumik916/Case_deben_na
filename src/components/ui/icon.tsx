import {
  AlertTriangle,
  Beaker,
  Briefcase,
  Camera,
  Car,
  CircleDot,
  ClipboardList,
  Droplets,
  FileText,
  Fingerprint,
  Flame,
  Folder,
  Gavel,
  Home,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  PenTool,
  Plug,
  Scale,
  Search,
  Shield,
  Target,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons an admin may pick for a case type or a section, keyed by the string
 * stored in `case_types.icon` / `case_type_sections.icon`.
 *
 * A curated registry rather than a dynamic import of all of Lucide: it keeps
 * the bundle small, and it is the exact list the Case Type Builder offers in
 * its icon picker, so a stored value can never fail to render.
 */
export const ICONS: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  beaker: Beaker,
  briefcase: Briefcase,
  camera: Camera,
  car: Car,
  circle: CircleDot,
  'clipboard-list': ClipboardList,
  droplets: Droplets,
  'file-text': FileText,
  fingerprint: Fingerprint,
  flame: Flame,
  folder: Folder,
  gavel: Gavel,
  home: Home,
  lock: Lock,
  'map-pin': MapPin,
  'message-square': MessageSquare,
  package: Package,
  'pen-tool': PenTool,
  plug: Plug,
  scale: Scale,
  search: Search,
  shield: Shield,
  target: Target,
  truck: Truck,
  users: Users,
  wrench: Wrench,
  zap: Zap,
};

export const ICON_NAMES = Object.keys(ICONS).sort();

export function Icon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Component = (name && ICONS[name]) || Folder;
  return <Component className={className} aria-hidden="true" />;
}
