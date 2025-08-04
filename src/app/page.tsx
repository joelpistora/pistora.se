export default function Home() {
  return (
    <section className="max-w-2xl mx-auto text-center">
      <h2 className="text-3xl font-semibold mb-4">Welcome to my portfolio!</h2>
      <p className="mb-6">
        Welcome to the Pistora website
      </p>
      <a href="/projects" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition">
        View My Projects
      </a>
    </section>
  );
}