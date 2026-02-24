import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div
        className="text-8xl font-extrabold mb-2 gradient-text"
        style={{ lineHeight: 1 }}
      >
        404
      </div>
      <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Page not found
      </h2>
      <p className="text-sm mb-8 max-w-sm" style={{ color: 'var(--text-muted)' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link to="/">
          <Button variant="primary" icon={<Home className="w-4 h-4" />}>
            Dashboard
          </Button>
        </Link>
        <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => history.back()}>
          Go back
        </Button>
      </div>
    </div>
  );
}
