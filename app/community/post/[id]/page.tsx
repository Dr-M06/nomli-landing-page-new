import { redirect } from "next/navigation"

type PostPageProps = {
  params: Promise<{ id: string }>
}

export default async function CommunityPostRedirectPage({ params }: PostPageProps) {
  const { id } = await params
  const encodedId = encodeURIComponent(id || "")
  redirect(`/social?postId=${encodedId}`)
}
