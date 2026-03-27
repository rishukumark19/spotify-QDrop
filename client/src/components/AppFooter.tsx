export function AppFooter() {
  return (
    <footer className="w-full py-4 text-center text-xs text-muted-foreground">
      <p>Crafted with Curiosity</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <a
          href="https://x.com/rishukuamrk19"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          X
        </a>
        <span aria-hidden="true" className="text-muted-foreground/40">
          /
        </span>
        <a
          href="https://instagram.com/ranjan.rk19"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Instagram
        </a>
      </div>
    </footer>
  );
}
