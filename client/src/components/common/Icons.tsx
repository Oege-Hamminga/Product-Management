import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const PencilIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const ChevronRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ImageIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export const UploadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const TruckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M3 17V6a1 1 0 0 1 1-1h9v12" />
    <path d="M13 9h4l4 4v4h-2" />
    <circle cx="7.5" cy="17.5" r="2" />
    <circle cx="17.5" cy="17.5" r="2" />
  </svg>
);

export const SparkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);

export const MinusCircleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
);
