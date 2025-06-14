// ResizeObserver warning suppression
const suppressResizeObserverWarning = () => {
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0]?.includes("ResizeObserver loop")) {
      return;
    }
    originalError.apply(console, args);
  };
};

export default suppressResizeObserverWarning;
