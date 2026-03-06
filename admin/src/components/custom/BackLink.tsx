import { Link } from "@strapi/design-system";
import { ArrowLeft } from "@strapi/icons";
import { NavLink } from "react-router-dom";

interface BackLinkProps {
  to?: string;
}

export function BackLink({ to }: BackLinkProps) {
  if (to) {
    return (
      <Link tag={NavLink} to={to} startIcon={<ArrowLeft />}>
        Go back
      </Link>
    );
  }

  return (
    <Link tag={NavLink} to=".." relative="path" startIcon={<ArrowLeft />}>
      Go back
    </Link>
  );
}

export default BackLink;
