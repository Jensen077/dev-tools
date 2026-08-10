import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/** 全局错误兜底：避免单个工具渲染异常导致整窗白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[devbox] 渲染异常:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="tool-page">
          <div className="error-box">渲染出错了: {this.state.message}</div>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={this.handleReload}>
              重试
            </button>
            <button
              className="btn"
              onClick={() => {
                window.location.reload();
              }}
            >
              刷新应用
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
