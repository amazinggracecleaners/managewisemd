import raw from "./placeholder-images.json";

export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
};

const data = raw as {
  placeholderImages: ImagePlaceholder[];
};

export const PlaceHolderImages = data.placeholderImages;
