export type FeePolicy =
  | { readonly kind: "none" }
  | { readonly kind: "recent" }
  | { readonly kind: "helius" }
  | { readonly kind: "triton" }
  | { readonly kind: "jito"; readonly tipLamports: bigint };
