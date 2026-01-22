declare type CachedFunction<T extends (...args: any[]) => any> = {
  (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T>;
  clearCache: () => void;
};

declare type TrackedFace = {
  track_id: number;
  img: string;
  selected: boolean;
};
