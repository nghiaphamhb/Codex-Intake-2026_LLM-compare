import { ComponentShowcase } from './ComponentShowcase';
import { ComparePage } from '../features/compare/ComparePage';

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isShowcase = searchParams.get('view') === 'components';

  if (isShowcase) {
    return <ComponentShowcase />;
  }

  return <ComparePage />;
}
