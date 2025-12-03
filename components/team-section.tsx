"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Code, Megaphone } from "lucide-react"
import Image from "next/image"

const team = [
  {
    name: "Umaru Mohammed",
    role: "Dev & UI/UX Designer",
    icon: Code,
    gradient: "from-primary to-purple-400",
    description: "Crafting seamless experiences and building the tech that brings people together.",
    photo: "/team/umaru.jpg", // Add your photo to public/team/umaru.jpg
  },
  {
    name: "Ikhoria Philips",
    role: "Head of Marketing",
    icon: Megaphone,
    gradient: "from-accent to-teal-400",
    description: "Spreading the word and connecting Nomli Mingle with communities worldwide.",
    photo: "/team/philips.jpg", // Add your photo to public/team/philips.jpg
  },
]

export function TeamSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section id="team" ref={ref} className="relative py-32 bg-[#0a0a0f] overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/2 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white text-sm font-medium mb-6">
            MEET THE TEAM
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            Built by a small team
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              with big dreams
            </span>
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            We're just two people passionate about creating meaningful connections and building something real.
          </p>
        </motion.div>

        {/* Team Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {team.map((member, index) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              whileHover={{ y: -8 }}
              className="group relative"
            >
              <div className="relative bg-white/[0.03] border border-white/10 rounded-3xl p-8 backdrop-blur-sm overflow-hidden h-full">
                {/* Content */}
                <div className="relative z-10">
                  {/* Photo */}
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden mb-6 border-2 border-white/10">
                    <Image
                      src={member.photo}
                      alt={member.name}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>

                  {/* Name & Role */}
                  <h3 className="text-2xl font-bold text-white mb-2">{member.name}</h3>
                  <p className={`text-sm font-medium mb-4 bg-gradient-to-r ${member.gradient} bg-clip-text text-transparent`}>
                    {member.role}
                  </p>

                  {/* Description */}
                  <p className="text-white/60 leading-relaxed">{member.description}</p>
                </div>

                {/* Bottom Accent Line */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${member.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left rounded-b-3xl`}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Message */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p className="text-white/40 text-sm max-w-xl mx-auto">
            Every feature, every pixel, every line of code — crafted with care by us. Thanks for being part of our
            journey.
          </p>
        </motion.div>
      </div>
    </section>
  )
}

