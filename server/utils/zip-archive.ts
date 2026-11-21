/** 极简 ZIP 打包（store 不压缩，文件名 UTF-8）。只用于后台导出，不引第三方依赖。 */
import { createWriteStream, type WriteStream } from 'node:fs'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

function dosDateTime(date: Date): { time: number, date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const stamp = dosDateTime(now)
  const chunks: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const body = Buffer.from(entry.data)
    const crc = crc32(body)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(stamp.time, 12)
    central.writeUInt16LE(stamp.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(body.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)

    directory.push(central, name)
    offset += local.length + name.length + body.length
  }

  const centralBuffer = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuffer, end])
}

/**
 * 边读边写的 ZIP：一次只把一个条目读进内存，写进文件后再读下一个。
 * 复赛原件包接近 500MB，全塞进 Buffer 会把进程撑爆（生产 2026-11-19 就是这么 OOM 的）。
 */
export class StreamingZip {
  private readonly stream: WriteStream
  private readonly stamp: { time: number, date: number }
  private offset = 0
  private readonly directory: Buffer[] = []

  constructor(target: string, now = new Date()) {
    this.stream = createWriteStream(target)
    this.stamp = dosDateTime(now)
  }

  private write(buffer: Buffer): Promise<void> {
    this.offset += buffer.length
    return new Promise((resolve, reject) => {
      this.stream.write(buffer, error => (error ? reject(error) : resolve()))
    })
  }

  async add(name: string, data: Uint8Array): Promise<void> {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(this.stamp.time, 10)
    header.writeUInt16LE(this.stamp.date, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28)
    const localOffset = this.offset
    await this.write(Buffer.concat([header, nameBytes]))
    await this.write(Buffer.from(data))
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0x0800, 8)
    record.writeUInt16LE(0, 10)
    record.writeUInt16LE(this.stamp.time, 12)
    record.writeUInt16LE(this.stamp.date, 14)
    record.writeUInt32LE(crc, 16)
    record.writeUInt32LE(data.length, 20)
    record.writeUInt32LE(data.length, 24)
    record.writeUInt16LE(nameBytes.length, 28)
    record.writeUInt16LE(0, 30)
    record.writeUInt16LE(0, 32)
    record.writeUInt16LE(0, 34)
    record.writeUInt16LE(0, 36)
    record.writeUInt32LE(0, 38)
    record.writeUInt32LE(localOffset, 42)
    this.directory.push(Buffer.concat([record, nameBytes]))
  }

  async finish(): Promise<number> {
    const directoryOffset = this.offset
    for (const record of this.directory) await this.write(record)
    const size = this.offset
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(this.directory.length, 8)
    end.writeUInt16LE(this.directory.length, 10)
    end.writeUInt32LE(size - directoryOffset, 12)
    end.writeUInt32LE(directoryOffset, 16)
    end.writeUInt16LE(0, 20)
    await this.write(end)
    const total = this.offset
    await new Promise<void>((resolve, reject) => {
      this.stream.end(() => resolve())
      this.stream.on('error', reject)
    })
    return total
  }
}
