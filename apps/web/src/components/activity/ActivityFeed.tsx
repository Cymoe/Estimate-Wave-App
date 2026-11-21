import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertCircle, Bot, CheckCircle, Clock, DollarSign, Edit, Image, ListChecks,
  PenTool, Plus, Send, Trash2, XCircle, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useActivity } from './useActivity';

const ICONS: Record<string, LucideIcon> = {
  plus: Plus,
  edit: Edit,
  trash: Trash2,
  send: Send,
  sign: PenTool,
  check: CheckCircle,
  x: XCircle,
  money: DollarSign,
  photo: Image,
  task: ListChecks,
  alert: AlertCircle,
  bot: Bot,
  activity: Activity,
};

const TONES: Record<string, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  red: 'text-red-400',
  amber: 'text-amber-400',
  purple: 'text-purple-400',
  gray: 'text-gray-400',
};

interface ActivityFeedProps {
  organizationId?: string;
  /** Only one kind: "estimate", "project", "lead", "client", "purchase_order", "expense", "organization". */
  resourceType?: string;
  limit?: number;
  compact?: boolean;
  /** Called when a row's link is followed (the panel closes). */
  onOpen?: () => void;
}

/** What happened in the company, newest first: who did it, what, when, and a link to it. */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ organizationId, resourceType, limit = 50, compact = false, onOpen }) => {
  const rows = useActivity(organizationId, resourceType, limit);

  if (!organizationId || rows === undefined) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="activity-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3B82F6]" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Nothing here yet</p>
        <p className="text-sm mt-1">Estimates, signatures, orders and jobs show up here as they happen.</p>
      </div>
    );
  }

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-2'} data-testid="activity-feed">
      {rows.map((row) => {
        const Icon = ICONS[row.icon] ?? Activity;
        const when = new Date(row.at);
        return (
          <li key={row.id} className={`flex ${compact ? 'gap-3 py-2' : 'gap-4 py-3'}`} data-testid="activity-row">
            <div className={`flex-shrink-0 ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-[#2A2A2A] flex items-center justify-center`}>
              <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${TONES[row.tone] ?? TONES.gray}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`${compact ? 'text-sm' : ''} text-gray-300 break-words`}>
                <span className="text-white font-medium">{row.who}</span>{' '}
                {row.link ? (
                  <Link to={row.link} onClick={onOpen} className="text-blue-400 hover:text-blue-300">
                    {row.text}
                  </Link>
                ) : (
                  row.text
                )}
              </p>
              <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500 mt-0.5 flex items-center gap-1`}>
                <Clock className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                <time dateTime={row.at} title={format(when, 'PPpp')}>
                  {formatDistanceToNow(when, { addSuffix: true })}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
