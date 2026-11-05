import type { Props } from "./index.server";
import "./style.css";

export default function HomePage({ message }: Props) {
  return (
    <main>
      <h1>{message}</h1>
      <p>
        Server route: <a href="/api/hello">/api/hello</a>
      </p>
    </main>
  );
}
