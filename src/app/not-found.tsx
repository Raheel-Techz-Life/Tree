import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="center-page">
      <div className="card">
        <h1>Not found</h1>
        <p className="sub">
          This tree doesn&apos;t exist, or you&apos;re not a member of it. Ask an admin of the
          tree for an invite code.
        </p>
        <Link className="btn" href="/trees">Back to your trees</Link>
      </div>
    </div>
  );
}
