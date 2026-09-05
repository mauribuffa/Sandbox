import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import Image from "next/image"

import logo from "../icon.svg"
import { ChatComposer } from "@/components/chat-composer"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { suggestions } from "@/lib/game/suggestions"

export default async function Page() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6">
      <Empty className="flex-none">
        <EmptyHeader className="gap-3">
          <EmptyMedia className="mb-4">
            <Image src={logo} alt="Logo" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            What should we build today?
          </EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-2xl gap-6">
          <ChatComposer />
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map(({ icon: Icon, label }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                className="rounded-full font-normal text-muted-foreground"
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        </EmptyContent>
      </Empty>
      <div className="flex flex-col items-center gap-3">
        <UserButton />
        <OrganizationSwitcher />
      </div>
    </div>
  )
}
