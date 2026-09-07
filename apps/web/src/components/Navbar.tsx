import Link from "next/link";

export default function Navbar() {
  return (
    <header className="bg-white shadow p-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold">Pistora.se</h1>
      <nav>
        <Link href="/" className="mr-4">Home</Link>
        <Link href="/projects" className="mr-4">Projects</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </header>
  );
}