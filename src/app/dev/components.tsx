import { Redirect } from 'expo-router';
import { ComponentGallery } from '@/ui/gallery/ComponentGallery';

// Developer-only route. expo-router builds a route from every file, so the file exists in every build; this guard
// (and Stack.Protected in _layout) keeps it unreachable when __DEV__ is false (release builds).
export default function ComponentGalleryRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ComponentGallery />;
}
