/* eslint @typescript-eslint/no-unused-vars: 0 */

import sqlite3 from "sqlite3"
import {instrument} from "succinct-async"
import {parseJson, now} from "@welshman/lib"
import {
  SignedEvent,
  getTagValue,
  getTagValues,
  getTags,
  getAddress,
  makeSecret,
} from "@welshman/util"
import {Channel, VapidSubscription, APNSSubscription, FCMSubscription, Subscription} from "./domain.js"

const db = new sqlite3.Database("db")

type Param = number | string | boolean

type Row = Record<string, any>

const run = (query: string, params: Param[] = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      return err ? reject(err) : resolve(this.changes > 0)
    })
  })

// prettier-ignore
const all = <T=Row>(query: string, params: Param[] = []) =>
  new Promise<T[]>((resolve, reject) => {
    db.all(query, params, (err, rows: T[]) => (err ? reject(err) : resolve(rows)))
  })

// prettier-ignore
const get = <T=Row>(query: string, params: Param[] = []) =>
  new Promise<T | undefined>((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err)
      } else if (row) {
        resolve(row as T)
      } else {
        resolve(undefined)
      }
    })
  })

const exists = (query: string, params: Param[] = []) =>
  new Promise<boolean>((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows.length > 0)))
  })

async function assertResult<T>(p: T | Promise<T>) {
  return (await p)!
}

// Migrations

const addColumnIfNotExists = async (tableName: string, columnName: string, columnDef: string) => {
  try {
    const tableInfo = await all(`PRAGMA table_info(${tableName})`)
    const columnExists = tableInfo.some((col: any) => col.name === columnName)

    if (!columnExists) {
      await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`)
    }
  } catch (err: any) {
    if (!err.message.includes("duplicate column name")) {
      throw err
    }
  }
}

export const migrate = () =>
  new Promise<void>(async (resolve, reject) => {
    try {
      db.serialize(async () => {
        await run(
          `
          CREATE TABLE IF NOT EXISTS subscription (
            pk TEXT PRIMARY KEY,
            sk TEXT NOT NULL,
            channel TEXT NOT NULL,
            errors number NOT NULL,
            data JSON NOT NULL
          )
        `,
        )
        resolve()
        })
    } catch (err) {
      reject(err)
    }
  })

// Alerts

export const parseSubscription = (row: any): Subscription | undefined => {
  if (row) {
    const {pk, sk, channel, errors} = row
    const data = parseJson(row.data)

    if (!data) {
      return
    }

    if (channel === Channel.Vapid) {
      return {pk, sk, channel, errors, data} as VapidSubscription
    }

    if (channel === Channel.APNS) {
      return {pk, sk, channel, errors, data} as APNSSubscription
    }

    if (channel === Channel.FCM) {
      return {pk, sk, channel, errors, data} as FCMSubscription
    }
  }
}

export const getSubscription = instrument("database.getSubscription", async (pk: string) => {
  return parseSubscription(await get(`SELECT * FROM subscription WHERE pk = ?`, [pk]))
})

export const insertSubscription = instrument(
  "database.insertSubscription",
  async (subscription: Subscription) => {
    return assertResult(
      parseSubscription(
        await get(
          `INSERT INTO subscription (pk, sk, channel, errors, data)
           VALUES (?, ?, ?, ?, ?) RETURNING *`,
          [
            subscription.pk,
            subscription.sk,
            subscription.channel,
            subscription.errors,
            JSON.stringify(subscription.data),
          ],
        ),
      ),
    )
  },
)

export const deleteSubscription = instrument("database.deleteSubscription", async (pk: string) => {
  return parseSubscription(await get(`DELETE FROM subscription WHERE pk = ? RETURNING *`, [pk]))
})

export const incrementSubscriptionErrors = instrument(
  "database.incrementSubscriptionErrors",
  async (pk: string) => {
    return await get(
      `UPDATE subscription SET errors = errors + 1 WHERE pk = ?`,
      [pk],
    )
  },
)

export const resetSubscriptionErrors = instrument(
  "database.resetSubscriptionErrors",
  async (pk: string) => {
    return await get(
      `UPDATE subscription SET errors = 0 WHERE pk = ?`,
      [pk],
    )
  },
)
