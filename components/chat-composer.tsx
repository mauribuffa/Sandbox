"use client"

import { ArrowUp, ChevronDown, Grip } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  disabled,
}: ChatComposerProps) {
  const canSubmit = !disabled && value.trim().length > 0

  function submit() {
    if (!canSubmit) return
    onSubmit()
  }

  return (
    <div className="flex w-full flex-col">
      <InputGroup className="bg-popover">
        <InputGroupTextarea
          placeholder="Describe the game you want to build…"
          rows={1}
          className="field-sizing-content max-h-48 min-h-10"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={disabled}
        />
        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton />}>
              <Grip />
              Kimi K3
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Kimi K3</DropdownMenuItem>
              <DropdownMenuItem>Kimi K2</DropdownMenuItem>
              <DropdownMenuItem>Kimi K1.5</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            className="ml-auto rounded-full"
            onClick={submit}
            disabled={!canSubmit}
          >
            <ArrowUp />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
