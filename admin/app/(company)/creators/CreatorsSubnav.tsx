// Sub-navigation of the Creators section: the list and the sponsorship price calculator.
import { NavLinks } from '@/components/shell/NavLinks';

export function CreatorsSubnav() {
  return (
    <NavLinks
      label="Creators"
      className="subnav"
      items={[
        { href: '/creators', label: 'All creators' },
        { href: '/creators/calculator', label: 'Sponsorship price calculator' },
      ]}
    />
  );
}
