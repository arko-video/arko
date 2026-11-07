// Icône de l'outil « Avatars » (dev 3) : une grosse tête de chibi sur un petit corps (traits, comme Icones.tsx).

import { Svg } from '../../composants/Icones';

export const IconeAvatar = (p: { taille?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="M9.5 9h.01M14.5 9h.01M10.5 11.5c.9.7 2.1.7 3 0M8.5 21c0-3 1.5-5 3.5-5s3.5 2 3.5 5" />
  </Svg>
);
