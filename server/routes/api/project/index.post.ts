import type { User } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = getSession<User>(event)
  return await prisma.project.create({
    data: {
      hash: body.hash,
      name: body.name,
      userId: user.id,
      userName: body.userName || user.name,
    },
  })
})
