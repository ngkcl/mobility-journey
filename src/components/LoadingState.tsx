import { Loader2 } from 'lucide-react';

type LoadingStateProps = {
  label: string;
  className?: string;
};

export default function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div className={`bg-gray-900 rounded-xl p-8 border border-gray-800 text-center text-gray-400 flex flex-col items-center gap-3 ${className ?? ''}`}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
