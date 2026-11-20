import React from 'react';
import { SubjectCatalogSection } from '../../components/public/SubjectCatalogSection';

export const Catalog: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SubjectCatalogSection compactHeader={false} defaultStatusFilter="all" />
    </div>
  );
};
