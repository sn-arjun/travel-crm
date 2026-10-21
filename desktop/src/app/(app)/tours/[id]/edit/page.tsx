'use client';

import { useParams } from 'next/navigation';

import { TourForm } from '../../_components/tour-form';

export default function EditTourPage() {
  const params = useParams<{ id: string }>();
  return <TourForm tourId={params.id} />;
}
